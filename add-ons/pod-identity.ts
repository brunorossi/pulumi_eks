import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as k8s from '@pulumi/kubernetes';
import * as eks from "@pulumi/eks";

export class PodIdentityAddOn {
    
  constructor(
    public version: string,    
    public cluster: eks.Cluster,
  ) {

    new eks.Addon('pod-identity-add-on', {
        cluster: cluster,
        addonName: "eks-pod-identity-agent",
        addonVersion: version,
        resolveConflictsOnUpdate: "PRESERVE",
    });

  }
  
}