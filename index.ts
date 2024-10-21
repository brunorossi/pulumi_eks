import * as eks from "@pulumi/eks";
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { CloudwatchObservabilityAddOn } from "./add-ons/cloudwatch-observability";
import { PodIdentityAddOn } from "./add-ons/pod-identity";
import { LoadBalancerController } from "./controllers/load-balancer";
import { LoadBalancerApplication } from "./controllers/load-balancer-app";
import { MetricsServer } from "./metrics-server"
import { Karpenter } from "./charts/karpenter"
import { SubnetType } from "@pulumi/awsx/ec2";

const clusterName = 'MyEks';
const prefix = clusterName.toLowerCase()
const clusterTags = {}
const privateSubnetsTags = {"karpenter.sh/discovery": clusterName };
const publicSubnetsTags = {};

const eksVpc = new awsx.ec2.Vpc(`${prefix}-vpc`, {
    enableDnsHostnames: true,
    availabilityZoneNames: [ "us-east-1a", "us-east-1b", "us-east-1c" ],
    cidrBlock: "10.0.0.0/16",
    subnetSpecs: [
        { type: SubnetType.Private, tags: {...privateSubnetsTags, ...clusterTags } },
        { type: SubnetType.Public, tags: {...publicSubnetsTags, ...clusterTags } },
    ],    
    subnetStrategy: "Auto"
},
{
    transformations: [(args: any) => {
        if (args.type === "aws:ec2/vpc:Vpc" || args.type === "aws:ec2/subnet:Subnet") {
            return {
                props: args.props,
                opts: pulumi.mergeOptions(args.opts, { ignoreChanges: ["tags"] }),
            };
        }
        return undefined;
    }],
},);

const managedPolicyArns: string[] = [
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
];

const nodeGroupRole = new aws.iam.Role(`${prefix}-managed-node-group-role`, {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
        Service: "ec2.amazonaws.com",
    }),
});

let counter = 0;
for (const policy of managedPolicyArns) {
    const rpa = new aws.iam.RolePolicyAttachment(`${prefix}-node-group-role-policy-${counter++}`,
        { policyArn: policy, role: nodeGroupRole },
    );
}

const cluster = new eks.Cluster(`${prefix}-cluster`, {
    name: clusterName,
    vpcId: eksVpc.vpcId,
    publicSubnetIds: eksVpc.publicSubnetIds,
    privateSubnetIds: eksVpc.privateSubnetIds,
    nodeAssociatePublicIpAddress: false,
    createOidcProvider: true,
    skipDefaultNodeGroup: true,
    /*desiredCapacity: 0,
    minSize: 0,
    maxSize: 0,
    instanceType: "t3.small",*/
    version: "1.31",
    clusterSecurityGroupTags: { "karpenter.sh/discovery": clusterName },
    nodeSecurityGroupTags: { "karpenter.sh/discovery": clusterName },
    clusterTags: clusterTags,
    authenticationMode: eks.AuthenticationMode.API,
    accessEntries: {
        instanceRole: {
          principalArn: nodeGroupRole.arn,
          type: eks.AccessEntryType.EC2_LINUX,
        }
      }
});

eks.createManagedNodeGroup(
    `${prefix}-default-managed-node-group`,
    {
      cluster: cluster,
      enableIMDSv2: true,
      nodeGroupName: `${clusterName}-default-managed-node-group`,
      nodeRoleArn: nodeGroupRole.arn,
      scalingConfig: {
        desiredSize: 4,
        minSize: 1,
        maxSize: 4,
      },
      amiType: "AL2_x86_64",
      instanceTypes: ["t3.medium"],
    },
    cluster
  );


if (!cluster?.core?.oidcProvider) {
    throw new Error("Invalid cluster OIDC provider URL");
}
const clusterOidcProvider = cluster.core.oidcProvider;
export const clusterOidcProviderUrl = clusterOidcProvider.url;

new MetricsServer("3.12.2", cluster);

new CloudwatchObservabilityAddOn(
    "v2.1.2-eksbuild.1",
    "cloudwatch-agent", 
    clusterOidcProvider, 
    cluster,
)

new PodIdentityAddOn(
    "v1.0.0-eksbuild.1",
    cluster,
)

new Karpenter(
    "1.0.6", 
    "karpenter-service-account",   
    clusterOidcProvider, 
    cluster
)

new LoadBalancerController(
    "1.9.1", 
    "aws-loadbalancer-controller",   
    clusterOidcProvider, 
    cluster
)

new LoadBalancerApplication(
    "sample-lb-app",
    "ns-lb-app",    
    eksVpc,
    cluster,
)

export const kubeconfig = cluster.kubeconfig;
