import * as k8s from '@kubernetes/client-node';

export function getKubeConfig(kubeconfig?: string): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();

  if (kubeconfig) {
    kc.loadFromString(kubeconfig);
  } else {
    kc.loadFromDefault();
  }

  return kc;
}
