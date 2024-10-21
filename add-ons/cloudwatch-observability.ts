import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from '@pulumi/kubernetes';
import * as eks from "@pulumi/eks";

export class CloudwatchObservabilityAddOn {
    
  constructor(
    public version: string,    
    public serviceAccountName: string, 
    public clusterOidcProvider: aws.iam.OpenIdConnectProvider,
    public cluster: eks.Cluster,
  ) {

    const namespace = "amazon-cloudwatch" 
    const prefix = "cloudwatch-observability"

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
                }, 
                {
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
  
    new aws.iam.RolePolicyAttachment(`${prefix}-iam-policy`, {
        policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
        role: role,
    });

    new eks.Addon(`${prefix}-add-on`, {
        cluster: cluster,
        addonName: "amazon-cloudwatch-observability",
        addonVersion: version,
        resolveConflictsOnUpdate: "PRESERVE",
        serviceAccountRoleArn: role.arn
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
  }
}