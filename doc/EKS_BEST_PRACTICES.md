# EKS Best Practices

[User Guide](https://docs.aws.amazon.com/eks/latest/userguide)
[Best Practices](https://aws.github.io/aws-eks-best-practices)

## View Cluster Insights 

```bash
aws eks list-insights \
--region region-code \
--cluster-name my-cluster

aws eks describe-insight \
--region region-code \
--id 123e4567-e89b-42d3-a456-579642341238 \
--cluster-name my-cluster
```

## Update EKS version

(Official guide)[https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html]
(Cluster Upgrade Best Practices)[https://aws.github.io/aws-eks-best-practices/upgrades/]

### Overview of the cluster upgrade process

#### Compare the k8s version of your nodes and your control plane and perform a version update if needed

```bash
# get the k8s version of your control plane
kubectl version

# get the k8s version of all your nodes (self-managed, managed Amazon EC2 and Fargate nodes)
kubectl get nodes
```

Before updating your control plane to a new Kubernetes version, make sure that the Kubernetes minor version of both the managed nodes and Fargate nodes in your cluster are the same as your control plane's version. Update the k8s version of your nodes to the same version as your control plane before updating the control plane. 

[Update a managed node group](https://docs.aws.amazon.com/eks/latest/userguide/update-managed-node-group.html) 

[Update self-managed nodes](https://docs.aws.amazon.com/eks/latest/userguide/update-workers.html)

If you have Fargate nodes with a minor version lower than the control plane version, first delete the Pod that's represented by the node. Then update your control plane. Any remaining Pods will update to the new version after you redeploy them.


#### If your cluster version is < 1.25 pay attention to Pod Security Policy deprecation 

[Pod Security Policy](https://docs.aws.amazon.com/eks/latest/userguide/pod-security-policy.html)

[Pod Security Policy Removal](https://docs.aws.amazon.com/eks/latest/userguide/pod-security-policy-removal-faq.html)

```bash
# check if pod security policy is in place
kubectl get psp eks.privileged

# check which pods are impacted by the psp if it exists
kubectl get pod -A -o jsonpath='{range.items[?(@.metadata.annotations.kubernetes\.io/psp)]}{.metadata.name}{"\t"}{.metadata.namespace}{"\t"}{.metadata.annotations.kubernetes\.io/psp}{"\n"}'
```

#### If your cluster version is < 1.18 or later, remove a discontinued term from your CoreDNS manifest

```bash
# check to see if your CoreDNS manifest has a line that only has the word upstream.
kubectl get configmap coredns -n kube-system -o jsonpath='{$.data.Corefile}' | grep upstream

# If the line exists, remove the line near the top of the file that only has the word upstream in the configmap file

# save the changes
kubectl edit configmap coredns -n kube-system -o yaml
```

#### Update your cluster using AWS cli

Before to start di upgrade read the reccommendations [here](https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html)

```bash
# start the migration
aws eks update-cluster-version \
--region region-code \
--name my-cluster \
--kubernetes-version 1.31

# check up the status of the migration
aws eks describe-update \
--region region-code \
--name my-cluster \
--update-id b5f0ba18-9a87-4450-b5a0-825e6e84496f
```

After the upgrade read and perform the tasks described [here](https://docs.aws.amazon.com/eks/latest/userguide/update-cluster.html)

