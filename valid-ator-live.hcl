job "valid-ator-live" {
  datacenters = ["ator-fin"]
  type = "service"

  group "valid-ator-live-group" {
    
    count = 1

    volume "mongodb" {
      type = "host"
      read_only = false
      source = "mongodb"
    }

    network {
      mode = "bridge"
      port "mongodb" {
        static = 37001
        host_network = "wireguard"
      }
      port "rediscache" {
        to = 6379
        host_network = "wireguard"
      }
      port "validator" {
        to = 3000
        host_network = "wireguard"
      }
    }

    task "valid-ator-live-mongo" {
      driver = "docker"
      config {
        image = "mongo:5.0"
        command = "mongod --port 37001"
      }

      lifecycle {
        sidecar = true
        hook = "prestart"
      }

      volume_mount {
        volume = "mongodb"
        destination = "/data/db"
        read_only = false
      }

      resources {
        cpu    = 2048
        memory = 4096
      }

      service {
        name = "valid-ator-live-mongo"
        port = "mongodb"

        check {
          name     = "MongoDB health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }

    task "valid-ator-live-redis" {
      driver = "docker"
      config {
        image = "redis:7"
      }

      lifecycle {
        sidecar = true
        hook = "prestart"
      }

      resources {
        cpu    = 2048
        memory = 8192
      }

      service {
        name = "valid-ator-live-redis"
        port = "rediscache"
        
        check {
          name     = "Redis health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }

    task "valid-ator-live-service" {
      driver = "docker"
      config {
        image = "ghcr.io/ator-development/valid-ator:[[.deploy]]"
      }

      vault {
        policies = ["valid-ator-live"]
      }

      template {
        data = <<EOH
        {{with secret "kv/valid-ator/live"}}
          VALIDATOR_KEY="{{.Data.data.VALIDATOR_KEY}}"
          BUNDLR_NETWORK="{{.Data.data.BUNDLR_NETWORK}}"
          MONGO_URI="{{.Data.data.MONGO_URI}}"
          REDIS_HOSTNAME="{{.Data.data.REDIS_HOSTNAME}}"
        {{end}}
        RELAY_REGISTRY_TXID="[[ consulKey "smart-contracts/live/relay-registry-address" ]]"
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        IS_LIVE="true"
        VALIDATOR_VERSION="[[.commit_sha]]"
        REDIS_PORT="${NOMAD_PORT_rediscache}"
        ONIONOO_REQUEST_TIMEOUT=60000
        ONIONOO_REQUEST_MAX_REDIRECTS=3
        ONIONOO_DETAILS_URI="https://onionoo.torproject.org/details"
        BUNDLR_NODE="http://node2.bundlr.network"
      }

      resources {
        cpu    = 4096
        memory = 8192
      }

      service {
        name = "valid-ator-live"
        port = "validator"
        
        check {
          name     = "valid-ator health check"
          type     = "http"
          path     = "/health"
          interval = "5s"
          timeout  = "10s"
          check_restart {
            limit = 30
            grace = "15s"
          }
        }
      }
    }
  }
}