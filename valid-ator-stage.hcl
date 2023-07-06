job "valid-ator-stage" {
  datacenters = ["ator-fin"]
  type = "service"

  group "valid-ator-stage-group" {
    
    count = 1

    volume "mongodb-stage" {
      type = "host"
      read_only = false
      source = "mongodb-stage"
    }

    network {
      mode = "bridge"
      port "mongodb" {
        to = 27017
      }
      port "rediscache" {
        to = 6379
      }
      port "validator" {
        to = 3000
      }
    }

    task "valid-ator-stage-mongo" {
      driver = "docker"
      config {
        image = "mongo:5.0"
      }

      lifecycle {
        sidecar = true
        hook = "prestart"
      }

      volume_mount {
        volume = "mongodb-stage"
        destination = "/data/db"
        read_only = false
      }

      resources {
        cpu    = 2048
        memory = 4096
      }

      service {
        name = "valid-ator-stage-mongo"
        port = "mongodb"        
        
        check {
          name     = "Stage MongoDB health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }

    task "valid-ator-stage-redis" {
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
        name = "valid-ator-stage-redis"
        port = "rediscache"
        
        check {
          name     = "Stage Redis health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }

    task "valid-ator-stage-service" {
      driver = "docker"
      config {
        image = "ghcr.io/ator-development/valid-ator:[[.deploy]]"
        force_pull = true
      }

      vault {
        policies = ["valid-ator-stage"]
      }

      template {
        data = <<EOH
        {{with secret "kv/valid-ator/stage"}}
          VALIDATOR_KEY="{{.Data.data.VALIDATOR_KEY}}"
          BUNDLR_NETWORK="{{.Data.data.BUNDLR_NETWORK}}"
        {{end}}
        RELAY_REGISTRY_TXID="[[ consulKey "smart-contracts/stage/relay-registry-address" ]]"
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        IS_LIVE="true"
        VALIDATOR_VERSION="[[.commit_sha]]"
        MONGO_URI="mongodb://localhost:${NOMAD_PORT_mongodb}/valid-ator-stage"
        REDIS_HOSTNAME="localhost"
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
        name = "valid-ator-stage"
        port = "validator"
        
        check {
          name     = "Stage valid-ator health check"
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