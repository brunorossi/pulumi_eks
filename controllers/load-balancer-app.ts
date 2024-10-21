import * as eks from "@pulumi/eks";
import * as k8s from '@pulumi/kubernetes';
import * as awsx from "@pulumi/awsx";

export class LoadBalancerApplication {

    constructor(
        public serviceName: string,
        public namespaceName: string,
        public vpc: awsx.ec2.Vpc,
        public cluster: eks.Cluster,
    ) {

        const prefix = "nginx-simple-app"
       
        new k8s.core.v1.Namespace(`${prefix}-namespace`, {
            metadata: {
                name: namespaceName, 
            },
        }, { provider: cluster.provider });

        const appLabels = {
            "app.kubernetes.io/name": serviceName
        } 

        new k8s.apps.v1.Deployment(`${prefix}-deployment`, {
            metadata: {
                namespace: namespaceName,
            },
            spec: {           
                selector: { matchLabels: appLabels },
                replicas: 1,
                template: {
                    metadata: {
                        name: serviceName,
                        namespace: namespaceName,
                        labels: appLabels
                    }, 
                    spec: {
                        containers: [{
                            name: serviceName,
                            image: "nginx",
                            imagePullPolicy: "IfNotPresent",
                            ports: [{ containerPort: 80 }],
                            resources: {
                              requests: {
                                    cpu: "0.125", 
                                    memory: "50Mi"
                                }
                            }
                        }],
                    }
                },
            }
        }, { provider: cluster.provider });

        new k8s.core.v1.Service(`${prefix}-service`, {
            metadata: {
                name: serviceName,
                namespace: namespaceName,
                labels: appLabels,
            },
            spec: {
                type: "NodePort",
                ports: [{
                    port: 80,
                    protocol: "TCP",
                    targetPort: 80,
                }],
                selector: appLabels,
            },
        }, { provider: cluster.provider });
        
        new k8s.networking.v1.Ingress(`${prefix}-ingress`, {
            metadata: {
                name: serviceName + "-ingress",
                namespace: namespaceName,
                annotations: {
                  "alb.ingress.kubernetes.io/load-balancer-name": serviceName + "-ingress",
                  "alb.ingress.kubernetes.io/ip-address-type": "ipv4",
                  "alb.ingress.kubernetes.io/healthcheck-protocol": "HTTP",
                  "alb.ingress.kubernetes.io/healthcheck-port": "traffic-port",
                  "alb.ingress.kubernetes.io/healthcheck-path": "/",
                  "alb.ingress.kubernetes.io/healthcheck-interval-seconds": "15",
                  "alb.ingress.kubernetes.io/healthcheck-timeout-seconds": "5",
                  "alb.ingress.kubernetes.io/healthy-threshold-count": "5",
                  "alb.ingress.kubernetes.io/unhealthy-threshold-count": "5",
                  "alb.ingress.kubernetes.io/success-codes": "200",
                  "alb.ingress.kubernetes.io/backend-protocol": "HTTP",
                  "alb.ingress.kubernetes.io/scheme": "internet-facing",
                  "alb.ingress.kubernetes.io/subnets": vpc.publicSubnetIds.apply(publicSubnetIds => publicSubnetIds.join(',')),
                  "kubernetes.io/ingress.class": "alb",
                }
            },
            spec: {
                ingressClassName: "alb",
                rules: [{
                    http: {
                        paths: [{
                            backend: {
                                service: {
                                    name: serviceName,
                                    port: {
                                        number: 80,
                                    },
                                },
                            },
                            path: "/",
                            pathType: "Prefix",
                        }],
                    },
                }],
            },
        }, { provider: cluster.provider });
        
    }
}