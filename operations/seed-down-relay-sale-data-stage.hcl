job "seed-down-relay-sale-data-stage" {
  datacenters = ["ator-fin"]
  type = "batch"

  group "seed-down-relay-sale-data-stage-group" {
    count = 1

    task "seed-down-relay-sale-data-stage-task" {
      driver = "docker"

      resources {
        cpu    = 4096
        memory = 8192
      }

      env {
        CPU_COUNT="1"
      }

      template {
        data = <<EOH
        {{- range service "validator-stage-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/valid-ator-stage-testnet"
        {{- end }}
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      template {
        change_mode = "noop"
        data = "no-data"
        destination = "local/relay-sale-data.csv"
      }

      config {
        image = "ghcr.io/anyone-protocol/valid-ator:stage"
        volumes = [ "local/relay-sale-data.csv:/data/relay-sale-data.csv" ]
        entrypoint = [ "node" ]
        args = [
          "dist/cli/main.js",
          "seed", "relay-sale-data",
          "--data", "/data/relay-sale-data.csv",
          "down"
        ]        
      }
    }
  }
}
