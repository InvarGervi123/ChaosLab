terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

provider "kubernetes" {
  config_path    = pathexpand("~/.kube/config")
  config_context = "kind-chaoslab"
}

resource "kubernetes_deployment_v1" "nginx" {
  metadata {
    name      = "chaos-nginx"
    namespace = "default"
    labels    = { app = "chaos-nginx" }
  }

  spec {
    replicas               = 5
    revision_history_limit = 10

    selector {
      match_labels = { app = "chaos-nginx" }
    }

    strategy {
      type = "RollingUpdate"
      rolling_update {
        max_surge       = "25%"
        max_unavailable = "25%"
      }
    }

    template {
      metadata {
        labels = { app = "chaos-nginx" }
      }
      spec {
        automount_service_account_token = false
        enable_service_links            = false

        container {
          name              = "nginx"
          image             = "nginx:alpine"
          image_pull_policy = "IfNotPresent"

          liveness_probe {
            http_get {
              path = "/"
              port = "80"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 1
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/"
              port = "80"
            }
            initial_delay_seconds = 2
            period_seconds        = 5
            timeout_seconds       = 1
            failure_threshold     = 3
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "nginx" {
  metadata {
    name      = "chaos-nginx"
    namespace = "default"
    labels    = { app = "chaos-nginx" }
  }

  spec {
    selector = { app = "chaos-nginx" }
    port {
      port        = 80
      target_port = 80
      protocol    = "TCP"
    }
    type = "ClusterIP"
  }
}
