import * as eks from "@pulumi/eks";
import * as k8s from '@pulumi/kubernetes';
import * as aws from "@pulumi/aws";
import * as fs from 'fs';
import * as path from 'path';
import * as pulumi from "@pulumi/pulumi";

export class LoadBalancerController {

    constructor(
        public version: string, 
        public serviceAccountName: string, 
        public clusterOidcProvider: aws.iam.OpenIdConnectProvider,
        public cluster: eks.Cluster,
    ) {

        const namespace = "kube-system"
        const prefix = "aws-load-balancer-controller"

        const rolePolicy = new aws.iam.Policy(`${prefix}-iam-policy`, {
            policy: JSON.parse(
                fs.readFileSync(
                    path.resolve(__dirname, "./iam-policies/load-balancer.json"), 
                    "utf-8"
                )
            )
        });

        const assumeRolePolicy = pulumi.all([ 
            clusterOidcProvider.url, 
            clusterOidcProvider.arn, 
            namespace, 
            serviceAccountName
        ]).apply(([url, arn, namespace, serviceAccountName]) => aws.iam.getPolicyDocument({
              statements: [{
                  actions: ["sts:AssumeRoleWithWebIdentity"],
                  conditions: [
                    {
                      test: "StringEquals",
                      values: [`system:serviceaccount:${namespace}:${serviceAccountName}`],
                      variable: `${url.replace("https://", "")}:sub`,
                    }, {
                      test: "StringEquals",
                      values: [`sts.amazonaws.com`],
                      variable: `${url.replace("https://", "")}:aud`,
                    },
                  ],
                  effect: "Allow",
                  principals: [{
                      identifiers: [arn],
                      type: "Federated",
                  }],
              }],
          }));
        
        const role = new aws.iam.Role(`${prefix}-role`, {
            assumeRolePolicy: assumeRolePolicy.json,
        });

        new aws.iam.RolePolicyAttachment(`${prefix}-role-policy-attachment`, {
            policyArn: rolePolicy.arn,
            role: role,
        });
      
        new k8s.core.v1.ServiceAccount(`${prefix}-service-account`, {
            metadata: {
                namespace: namespace,
                name: serviceAccountName,
                annotations: {
                    "eks.amazonaws.com/role-arn": role.arn, 
                },
            },
        }, { provider: cluster.provider });

        new k8s.helm.v3.Chart(`${prefix}-chart`, {
            namespace: namespace,
            chart: "aws-load-balancer-controller",
            version: version, 
            fetchOpts: {
                repo: "https://aws.github.io/eks-charts",
            },
            values: {
                clusterName: cluster.eksCluster.name,
                enableServiceMutatorWebhook: false,
                serviceAccount: {
                    create: false,
                    name: serviceAccountName,
                },
            }
        }, { provider: cluster.provider });
    }
}