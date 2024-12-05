job "valid-ator-live" {
  datacenters = ["ator-fin"]
  type = "service"

  update {
    healthy_deadline  = "45m"
    progress_deadline = "60m"
  }

  group "valid-ator-live-group" {
    
    count = 1

    volume "geo-ip-db" {
      type      = "host"
      read_only = false
      source    = "geo-ip-db"
    }

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
        image = "ghcr.io/anyone-protocol/valid-ator:[[.commit_sha]]"
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
          REGISTRATOR_OPERATOR_KEY="{{.Data.data.REGISTRATOR_OPERATOR_KEY}}"
          IRYS_NETWORK="{{.Data.data.IRYS_NETWORK}}"
          JSON_RPC="{{.Data.data.JSON_RPC}}"
          DRE_HOSTNAME="{{.Data.data.DRE_HOSTNAME}}"
          INFURA_NETWORK="{{.Data.data.INFURA_NETWORK}}"
          INFURA_WS_URL="{{.Data.data.INFURA_WS_URL}}"
          MAINNET_WS_URL="{{.Data.data.MAINNET_WS_URL}}"
          MAINNET_JSON_RPC="{{.Data.data.MAINNET_JSON_RPC}}"
        {{end}}
        RELAY_REGISTRY_CONTRACT_TXID="[[ consulKey "smart-contracts/live/relay-registry-address" ]]"
        DISTRIBUTION_CONTRACT_TXID="[[ consulKey "smart-contracts/live/distribution-address" ]]"
        FACILITY_CONTRACT_ADDRESS="[[ consulKey "facilitator/sepolia/live/address" ]]"
        REGISTRATOR_CONTRACT_ADDRESS="[[ consulKey "registrator/sepolia/live/address" ]]"
        TOKEN_CONTRACT_ADDRESS="[[ consulKey "ator-token/sepolia/live/address" ]]"
        RELAY_UP_NFT_CONTRACT_ADDRESS="[[ consulKey "relay-up-nft-contract/live/address" ]]"
        {{- range service "validator-live-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/valid-ator-live-testnet"
        {{- end }}
        {{- range service "validator-live-redis" }}
          REDIS_HOSTNAME="{{ .Address }}"
          REDIS_PORT="{{ .Port }}"
        {{- end }}
        {{- range service "onionoo-war-live" }}
          ONIONOO_DETAILS_URI="http://{{ .Address }}:{{ .Port }}/details"
        {{- end }}
        UPTIME_MINIMUM_RUNNING_COUNT=16
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        IS_LIVE="true"
        VALIDATOR_VERSION="[[.commit_sha]]"
        ONIONOO_REQUEST_TIMEOUT=60000
        ONIONOO_REQUEST_MAX_REDIRECTS=3
        IRYS_NODE="https://node2.irys.xyz"
        RELAY_REGISTRY_OPERATOR_MIN_BALANCE=0
        RELAY_REGISTRY_UPLOADER_MIN_BALANCE=1000000
        DISTRIBUTION_OPERATOR_MIN_BALANCE=0
        FACILITY_OPERATOR_MIN_BALANCE=1000000
        FACILITY_TOKEN_MIN_BALANCE=1000000
        CPU_COUNT="1"
        GEODATADIR="/geo-ip-db/data"
        GEOTMPDIR="/geo-ip-db/tmp"
        DRE_REQUEST_TIMEOUT=60000
        DRE_REQUEST_MAX_REDIRECTS=3
        DO_CLEAN="false"
      }

      volume_mount {
        volume      = "geo-ip-db"
        destination = "/geo-ip-db"
        read_only   = false
      }

      resources {
        cpu    = 4096
        memory = 32384
      }

      service {
        name = "valid-ator-live"
        port = "validator"
        
        check {
          name     = "valid-ator health check"
          type     = "http"
          path     = "/health"
          interval = "30s"
          timeout  = "10s"
          check_restart {
            limit = 180
            grace = "45s"
          }
        }
      }
    }
  }
}