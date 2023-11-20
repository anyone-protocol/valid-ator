job "valid-ator-live" {
  datacenters = ["ator-fin"]
  type = "service"

  group "valid-ator-live-group" {
    
    count = 1

    network {
      mode = "bridge"
      port "validator" {
        to = 3000
        host_network = "wireguard"
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
          RELAY_REGISTRY_OPERATOR_KEY="{{.Data.data.RELAY_REGISTRY_OPERATOR_KEY}}"
          DISTRIBUTION_OPERATOR_KEY="{{.Data.data.DISTRIBUTION_OPERATOR_KEY}}"
          FACILITY_OPERATOR_KEY="{{.Data.data.FACILITY_OPERATOR_KEY}}"
          BUNDLR_NETWORK="{{.Data.data.BUNDLR_NETWORK}}"
          JSON_RPC="{{.Data.data.JSON_RPC}}"
        {{end}}
        RELAY_REGISTRY_CONTRACT_TXID="[[ consulKey "smart-contracts/live/relay-registry-address" ]]"
        DISTRIBUTION_CONTRACT_TXID="[[ consulKey "smart-contracts/live/distribution-address" ]]"
        FACILITY_CONTRACT_ADDRESS="[[ consulKey "facilitator/goerli/live/address" ]]"
        TOKEN_CONTRACT_ADDRESS="[[ consulKey "ator-token/goerli/live/address" ]]"
        {{- range service "validator-live-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/valid-ator-live"
        {{- end }}
        {{- range service "validator-live-redis" }}
          REDIS_HOSTNAME="{{ .Address }}"
          REDIS_PORT="{{ .Port }}"
        {{- end }}
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        IS_LIVE="true"
        VALIDATOR_VERSION="[[.commit_sha]]"
        ONIONOO_REQUEST_TIMEOUT=60000
        ONIONOO_REQUEST_MAX_REDIRECTS=3
        ONIONOO_DETAILS_URI="https://onionoo.torproject.org/details"
        BUNDLR_NODE="http://node2.bundlr.network"
        RELAY_REGISTRY_OPERATOR_MIN_BALANCE=0
        RELAY_REGISTRY_UPLOADER_MIN_BALANCE=1000000
        DISTRIBUTION_OPERATOR_MIN_BALANCE=0
        FACILITY_OPERATOR_MIN_BALANCE=1000000
        FACILITY_TOKEN_MIN_BALANCE=1000000
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
            limit = 180
            grace = "15s"
          }
        }
      }
    }
  }
}