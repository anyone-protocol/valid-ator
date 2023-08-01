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
        args = [ "--port", "${NOMAD_PORT_mongodb}" ]
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
          DISTRIBUTION_CONTRACT_DATA_KEY="{{.Data.data.DISTRIBUTION_CONTRACT_DATA_KEY}}"
          JSON_RPC="{{.Data.data.JSON_RPC}}"
          FACILITY_OPERATOR_KEY="{{.Data.data.FACILITY_OPERATOR_KEY}}"
        {{end}}
        RELAY_REGISTRY_TXID="[[ consulKey "smart-contracts/live/relay-registry-address" ]]"
        DISTRIBUTION_CONTRACT_TXID="[[ consulKey "smart-contracts/live/distribution-address" ]]"
        FACILITY_CONTRACT_ADDRESS="[[ consulKey "facilitator-goerli/address" ]]"
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        IS_LIVE="true"
        VALIDATOR_VERSION="[[.commit_sha]]"
        MONGO_URI="mongodb://localhost:${NOMAD_PORT_mongodb}/valid-ator-live"
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