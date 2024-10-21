import * as eks from "@pulumi/eks";
import * as k8s from '@pulumi/kubernetes';
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as fs from 'fs';
import * as path from 'path';
import * as template from 'template-file';

export class Karpenter {

    constructor(
        public version: string, 
        public serviceAccountName: string, 
        public clusterOidcProvider: aws.iam.OpenIdConnectProvider,
        public cluster: eks.Cluster,
    ) {

        const namespace : string = "kube-system"
        const prefix : string = "karpenter"        

        const workerNodePoliciesNames : string[] = [
            'policy/AmazonEKSWorkerNodePolicy',
            'policy/AmazonEKS_CNI_Policy',
            'policy/AmazonEC2ContainerRegistryReadOnly',
            'policy/AmazonSSMManagedInstanceCore',
        ]
        const partition : pulumi.Output<aws.GetPartitionResult> = aws.getPartitionOutput({})
        const currentUser : pulumi.Output<aws.GetCallerIdentityResult> = aws.getCallerIdentityOutput({})
        const region : pulumi.Output<aws.GetRegionResult> = aws.getRegionOutput({})

        const interruptionQueue = new aws.sqs.Queue(`${prefix}-interruption-queue`, {
            name: pulumi.interpolate`KarpenterNodeRole${cluster.eksCluster.name}`,
            messageRetentionSeconds: 300,
            sqsManagedSseEnabled: true,
        });
        const interruptionQueuePolicy = interruptionQueue
            .arn.apply(arn => aws.iam.getPolicyDocumentOutput({
            statements: [
                {
                    sid: "SendMessage",
                    effect: "Allow",
                    principals: [{
                        type: "Service",
                        identifiers: [ "events.amazonaws.com", "sqs.amazonaws.com"],
                    }],
                    actions: ["sqs:SendMessage"],
                    resources: [arn],
                },
                {
                    sid: "DenyHTTP",
                    effect: "Deny",
                    actions: ["sqs:*"],
                    principals: [ { type: "*", identifiers: ["*"] } ],
                    resources: [arn],
                    conditions: [{
                        test: "Bool",
                        variable: "aws:SecureTransport",
                        values: [ "false" ],
                    }],
                },
            ],
        }));
        new aws.sqs.QueuePolicy(`${prefix}-interruption-queue-policy`, {
            queueUrl: interruptionQueue.id,
            policy: interruptionQueuePolicy.apply(interruptionQueuePolicy => interruptionQueuePolicy.json),
        });

        const assumeRoleNodePolicy = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRole"],
                effect: "Allow",
                principals: [{
                    type: "Service",
                    identifiers: [ pulumi.interpolate`ec2.${partition.dnsSuffix}` ]
                }],
            }],
        })

        const nodeRole = new aws.iam.Role(`${prefix}-node-role`, {
            name: pulumi.interpolate`KarpenterNodeRole${cluster.eksCluster.name}`,
            assumeRolePolicy: assumeRoleNodePolicy.apply(v => v.json)
        });

        let policy : pulumi.Output<aws.iam.GetPolicyResult>
        let counter : number = 1           
        workerNodePoliciesNames.forEach((policyName) => {
            policy = aws.iam.getPolicyOutput({
                arn: pulumi.interpolate`arn:${partition.id}:iam::aws:${policyName}`
            });
            new aws.iam.RolePolicyAttachment(`${prefix}-role-policy-attachment-${counter++}`, {
                policyArn: policy.apply(v => v.arn),
                role: nodeRole,
            });
        })
 
        const policyContent : pulumi.Output<string> = pulumi
        .all([partition, region, cluster.eksCluster.name, currentUser, nodeRole.arn, interruptionQueue.arn])
        .apply(([partition, region, clusterName, currentUser, nodeRoleArn, interruptionQueueArn]) => (
                template.render(
                    fs.readFileSync(
                        path.resolve(__dirname, "./iam-policies/karpenter-controller.json"), 
                        "utf-8"
                    ),
                    {   
                        partitionId: partition.id, 
                        regionId: region.id,
                        clusterName: clusterName, 
                        accountId: currentUser.accountId,
                        nodeRoleArn: nodeRoleArn,
                        interruptionQueueArn: interruptionQueueArn
                    }
                )   
            )
        )

        const controllerPolicy = new aws.iam.Policy(`${prefix}-controller-iam-policy`, {
            policy: policyContent
        });        

        const urlWithoutPrefix = clusterOidcProvider.url.apply(v => v.replace("https://", ""))

        const assumeRoleControllerPolicy = aws.iam.getPolicyDocumentOutput({
            statements: [{
                actions: ["sts:AssumeRoleWithWebIdentity"],
                conditions: [
                    {
                        test: "StringEquals",
                        values: [ pulumi.interpolate`system:serviceaccount:${namespace}:${serviceAccountName}` ],
                        variable: pulumi.interpolate`${urlWithoutPrefix}:sub`,
                    }, {
                        test: "StringEquals",
                        values: [ 'sts.amazonaws.com' ],
                        variable: pulumi.interpolate`${urlWithoutPrefix}:aud`,
                    },
                ],
                effect: "Allow",
                principals: [{
                    identifiers: [ clusterOidcProvider.arn ],
                    type: "Federated",
                }],
            }],
        });

        const controllerRole = new aws.iam.Role(`${prefix}-controller-role`, {
            name: pulumi.interpolate`KarpenterControllerRole${cluster.eksCluster.name}`,
            assumeRolePolicy: assumeRoleControllerPolicy.json,
        });

        new aws.iam.RolePolicyAttachment(`${prefix}-contoller-policy-attachment`, {
            policyArn: controllerPolicy.arn,
            role: controllerRole,
        });

        new k8s.core.v1.ServiceAccount(`${prefix}-service-account`, {
            metadata: {
                namespace: namespace,
                name: serviceAccountName,
                annotations: {
                    "eks.amazonaws.com/role-arn": controllerRole.arn, 
                },
            },
        }, { provider: cluster.provider });

        new aws.eks.AccessEntry(`${prefix}-access-entry`, {
                clusterName: cluster.eksCluster.name,
                principalArn: nodeRole.arn,
                kubernetesGroups: [
                    "bootstrappers",
                    "nodes"
                ],
                type: "STANDARD"
            }, 
            { dependsOn: [ cluster, ] }
        );

        const statusChangeRule = new aws.cloudwatch.EventRule(`${prefix}-scheduled-change-rule`, {
            name: pulumi.interpolate`${cluster.eksCluster.name}KarpenterScheduledChangeRule`,
            description: "Karpenter Scheduled Change Rule",
            eventPattern: JSON.stringify({
                "source": ["aws.health"],
                "detail-type": ["AWS Health Event"],
              }),
        });
        new aws.cloudwatch.EventTarget(`${prefix}-scheduled-change-rule-target`, {
            targetId: pulumi.interpolate`${cluster.eksCluster.name}KarpenterInterruptionQueueTarget`,
            rule: statusChangeRule.name,
            arn: interruptionQueue.arn,
        });

        const spotInterruptionRule = new aws.cloudwatch.EventRule(`${prefix}-spot-interruption-rule`, {
            name: pulumi.interpolate`${cluster.eksCluster.name}KarpenterSpotInterruptionRule`,
            description: "Karpenter Spot Interruption Rule",
            eventPattern: JSON.stringify({
                "source": ["aws.ec2"],
                "detail-type": ["EC2 Spot Instance Interruption Warning"],
              }),
        });
        new aws.cloudwatch.EventTarget(`${prefix}-spot-interruption-rule-target`, {
            targetId: pulumi.interpolate`${cluster.eksCluster.name}KarpenterInterruptionQueueTarget`,
            rule: spotInterruptionRule.name,
            arn: interruptionQueue.arn,
        });

        const rebalanceRule = new aws.cloudwatch.EventRule(`${prefix}-rebalance-rule`, {
            name: pulumi.interpolate`${cluster.eksCluster.name}KarpenterRebalanceRule`,
            description: "Karpenter Rebalance Rule",
            eventPattern: JSON.stringify({
                "source": ["aws.ec2"],
                "detail-type": ["EC2 Instance Rebalance Recommendation"],
              }),
        });
        new aws.cloudwatch.EventTarget(`${prefix}-rebalance-rule-target`, {
            targetId: pulumi.interpolate`${cluster.eksCluster.name}KarpenterInterruptionQueueTarget`,
            rule: rebalanceRule.name,
            arn: interruptionQueue.arn,
        });

        const instanceStateChangeRule = new aws.cloudwatch.EventRule(`${prefix}-instance-state-change-rule`, {
            name: pulumi.interpolate`${cluster.eksCluster.name}KarpenterInstanceStateChangeRule`,
            description: "Spot Instance State Change Rule",
            eventPattern: JSON.stringify({
                "source": ["aws.ec2"],
                "detail-type": ["EC2 Instance State-change Notification"],
              }),
        });
        new aws.cloudwatch.EventTarget(`${prefix}-instance-change-state-rule-target`, {
            targetId: pulumi.interpolate`${cluster.eksCluster.name}KarpenterInterruptionQueueTarget`,
            rule: instanceStateChangeRule.name,
            arn: interruptionQueue.arn,
        });
        
        new k8s.helm.v3.Chart(`${prefix}-chart`, {
                chart: "oci://public.ecr.aws/karpenter/karpenter",
                version: version, 
                namespace: namespace,
                values: {
                    clusterEndpoint: cluster.eksCluster.endpoint,
                    serviceAccount: {
                        create: false,
                        name: serviceAccountName,
                    },
                    settings: {
                        interruptionQueue: interruptionQueue.name,
                        clusterName: cluster.eksCluster.name,
                    },
                    controller: {
                        resources: {
                            request: {
                                cpu: 1,
                                memory: "1Gi"
                            },
                            limits: {
                                cpu: 1,
                                memory: "1Gi"
                            },
                        }
                    }
                }
            }, { provider: cluster.provider });   
    }
}




            

 