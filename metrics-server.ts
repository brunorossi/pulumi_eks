import * as eks from "@pulumi/eks";
import * as k8s from '@pulumi/kubernetes';

export class MetricsServer {

    constructor(
        public version: string, 
        public cluster: eks.Cluster,
    ) {

        new k8s.helm.v3.Chart("metrics-server", {
            chart: "metrics-server",
            version: version,
            fetchOpts:{
                repo: "https://kubernetes-sigs.github.io/metrics-server/",
            }
        }, { providers: { "kubernetes": cluster.provider }, dependsOn: [cluster] });

    }
}