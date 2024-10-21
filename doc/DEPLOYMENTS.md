# Deployments 

## Apply a deployment 

```bash
kubectl create namespace nginx-ns
kubectl apply -f nginx-deployment.yml
```

## Get deployments and pods 

```bash
# get the deployments across all the namespaces
kubectl get deployments --all-namespaces

# get the deployments into a proper namespaces
kubectl get deploymets -n nginx-ns

# get the pods across all the namespaces
kubectl get pods --all-namespaces

# get pods into a proper namespaces
kubectl get pods -n nginx-ns
```

## Scale a deployment 

```bash
# scale via kubectl
kubectl scale deployment/nginx-deployment -n nginx-ns --replicas=4

# or edit the deployment via kubectl, change the replicas number and save
kubectl edit deployment nginx-deployment -n nginx-ns
```

## Delete a pod 

```bash
kubectl delete pod {podname} --force
```

## Change the image of a container

```bash
kubectl set image deployment.v1.apps/nginx-deployment -n nginx-ns nginx=nginx:1.16.1

# or edit the deployment via kubectl, change the image name/version and save
kubectl edit deployment nginx-deployment -n nginx-ns
```

## Get the status of a deployment

```bash
kubectl rollout status deployment/nginx-deployment -n nginx-ns
```

## Rollback to the previous deployment version

```bash
kubectl rollout undo deployment/nginx-deployment -n nginx-ns
```