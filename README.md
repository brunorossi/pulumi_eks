# Deploy an EKS cluster with Pulumi

The following playbook is based on OS Ubuntu 20.04 LTS and it is an attempt 
to run an EKS cluster with Pulumi. Currently the EKS cluster is configured 
with Managed Node Pools, Karpenter, AWS Load Balancer Controller, Metrics Server 
Cloudwatch Insight Observability Add On and Pod Identity Add On.

## Install Pulumi

```bash
# install pulumi
curl -fsSL https://get.pulumi.com | sh
source ~/.bashrc

# check pulumi version
pulumi version

# configure the usage of the Pulumi cloud backend
# several backend options are available, see: https://www.pulumi.com/docs/iac/concepts/state-and-backends/
# run the following command and follow the instructions to create a proper Pulumi Token and successfully log in 
pulumi login
``` 

## Install NodeJS and Typescript

```bash
# install nvm 
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# install the latest node version
nvm install node

# install typescript
npm config set registry https://registry.npmjs.org/
npm install typescript --save-dev
```

## Install Docker engine

```bash
sudo apt update

# add prerequisite packages
sudo apt install apt-transport-https ca-certificates curl software-properties-common

# add GPG Key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# add docker repository
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable"

# install docker-ce package
sudo apt install docker-ce -y

# check if docker is running
sudo systemctl status docker

# add your user to the 'docker' group
sudo usermod -aG docker ${USER}
```

## Install kubectl 

```bash
# download kubectl
curl -LO "https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl"

# grant executable permissions to kubectl
chmod +x ./kubectl

# move kubectl into the destination folder
sudo mv ./kubectl /usr/local/bin/kubectl

# check if kubect is working as expected
kubectl version --client

# optional steps:

# add fzf, see: https://github.com/junegunn/fzf?tab=readme-ov-file
sudo apt install fzf -y

# install krew, a kubectl plugin manager, see: https://krew.sigs.k8s.io/
(
  set -x; cd "$(mktemp -d)" &&
  OS="$(uname | tr '[:upper:]' '[:lower:]')" &&
  ARCH="$(uname -m | sed -e 's/x86_64/amd64/' -e 's/\(arm\)\(64\)\?.*/\1\2/' -e 's/aarch64$/arm64/')" &&
  KREW="krew-${OS}_${ARCH}" &&
  curl -fsSLO "https://github.com/kubernetes-sigs/krew/releases/latest/download/${KREW}.tar.gz" &&
  tar zxvf "${KREW}.tar.gz" &&
  ./"${KREW}" install krew
)
echo 'export PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"' >> ${HOME}/.bashrc
source ~/.bashrc

# add kubectx and kubens plugins, see: https://github.com/ahmetb/kubectx
kubectl krew install ctx
kubectl krew install ns
```

## Install the AWS cli version 2 

```bash
# download
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"

# unzip
unzip awscliv2.zip

# install
sudo ./aws/install
```

## Install the AWS IAM Authenticator 

Read about AWS IAM Authenticator:

* [Github Repository](https://github.com/kubernetes-sigs/aws-iam-authenticator)
* [Learn AWS](https://www.learnaws.org/2023/08/22/aws-iam-authenticator/)


```bash
# download the binary
curl -L "https://github.com/kubernetes-sigs/aws-iam-authenticator/releases/download/v0.6.27/aws-iam-authenticator_0.6.27_linux_amd64" -o aws-iam-authenticator

# grant execution on binary
chmod +x ./aws-iam-authenticator

# move the binary into the proper target directory
sudo mv ./aws-iam-authenticator /usr/local/bin

# check if the authenticator works
aws-iam-authenticator version
```

## Install Helm

[Helm](https://helm.sh/)

```bash
# download Helm
curl -L "https://get.helm.sh/helm-v3.16.1-linux-amd64.tar.gz" -o helm.tar.gz 

# untar it
tar -zxvf helm.tar.gz

# grant executable permissions
chmod +x linux-amd64/helm

# move to target folder
mv linux-amd64/helm /usr/local/bin/helm

# clean up
rm -Rf linux-amd64 helm.tar.gz
```

## Release the EKS cluster 

```bash
# export AWS account variables
export AWS_ACCESS_KEY_ID=******
export AWS_SECRET_ACCESS_KEY=******
export AWS_REGION=us-east-1

# create the stack
pulumi up --stack <YOUR-PULUMI>/dev

# select the stack
pulumi stack select <YOUR-PULUMI>/dev

# get the stack output called kubeconfig and save it into kubeconfig.yml
pulumi stack output kubeconfig > kubeconfig.yml

# export the KUBECONFIG variable and point it to your kubeconfig.yml file
export KUBECONFIG=./kubeconfig.yml 

# verify if you are able to connect to the cluster and list nodes via kubectl
kubectl get nodes
```

## Test Karpenter

[See](./KARPENTER.md)


## References:

* [AWS Modernization with Pulumi](https://pulumi.awsworkshop.io/)
* [Introduction to GitOps on EKS with Weaveworks](https://weaveworks-gitops.awsworkshop.io/60_workshop_6_ml/00_prerequisites.md/50_install_aws_iam_auth.html)
* [Associate Service Account to IAM Role](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html)
* [EKS Blueprints](https://aws-quickstart.github.io/cdk-eks-blueprints/pipelines/)
* [EKS workshop](https://www.eksworkshop.com/docs/introduction/)
* [EKS workshop archive](https://archive.eksworkshop.com/)
* [Pod Identity Add On](https://securitylabs.datadoghq.com/articles/eks-pod-identity-deep-dive/)
* [Karpenter Blueprints](https://github.com/aws-samples/karpenter-blueprints)
* [Karpenter Helm Chart](https://artifacthub.io/packages/helm/karpenter/karpenter)
* [Karpenter Cloudformation Template](https://karpenter.sh/docs/reference/cloudformation/)

Cooked with L0V3 by [BR78](mailto:brunorossiweb@gmail.com)

