job "populate-relay-uptime-stage" {
  datacenters = ["ator-fin"]
  type = "batch"

  periodic {
    cron = "0 1 * * *" # every day at 1am
    prohibit_overlap = true
  }

  group "populate-relay-uptime-stage-group" {
    count = 1

    task "populate-relay-uptime-stage-task" {
      driver = "docker"

      vault {
        policies = ["valid-ator-stage"]
      }

      env {
        IS_LIVE="true"
        CPU_COUNT="1"
        DRE_REQUEST_TIMEOUT=60000
        DRE_REQUEST_MAX_REDIRECTS=3
        RELAY_REGISTRY_OPERATOR_MIN_BALANCE=1000000
        RELAY_REGISTRY_UPLOADER_MIN_BALANCE=1000000
        DISTRIBUTION_OPERATOR_MIN_BALANCE=1000000
        FACILITY_OPERATOR_MIN_BALANCE=1000000
        FACILITY_TOKEN_MIN_BALANCE=1000000
        IRYS_NODE="https://node2.irys.xyz"
        UPTIME_MINIMUM_RUNNING_COUNT="16"
      }

      template {
        data = <<EOH
        {{- range service "validator-stage-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/valid-ator-stage-testnet"
        {{- end }}
        DISTRIBUTION_CONTRACT_TXID="[[ consulKey "smart-contracts/stage/distribution-address" ]]"
        {{with secret "kv/valid-ator/stage"}}
          DISTRIBUTION_OPERATOR_KEY="{{.Data.data.DISTRIBUTION_OPERATOR_KEY}}"
          DRE_HOSTNAME="{{.Data.data.DRE_HOSTNAME}}"
          IRYS_NETWORK="{{.Data.data.IRYS_NETWORK}}"
        {{end}}
        EOH
        destination = "secrets/file.env"
        env = true
      }

      config {
        image = "ghcr.io/anyone-protocol/valid-ator:stage"
        entrypoint = [ "node" ]
        args = [ "dist/cli/main.js", "populate-relay-uptime" ]
      }
    }
  }
}
