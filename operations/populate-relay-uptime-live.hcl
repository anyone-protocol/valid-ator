job "populate-relay-uptime-live" {
  datacenters = ["ator-fin"]
  type = "batch"

  periodic {
    cron = "0 1 * * *" # every day at 1am
    prohibit_overlap = true
  }

  group "populate-relay-uptime-live-group" {
    count = 1

    task "populate-relay-uptime-live-task" {
      driver = "docker"

      env {
        UPTIME_MINIMUM_RUNNING_COUNT="16"
      }

      template {
        data = <<EOH
        {{- range service "validator-live-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/valid-ator-live-testnet"
        {{- end }}
        EOH
        destination = "secrets/file.env"
        env = true
      }

      config {
        image = "ghcr.io/ator-development/valid-ator:[[.deploy]]"
        entrypoint = [ "node" ]
        args = [ "dist/cli/main.js", "populate-relay-uptime" ]
      }
    }
  }
}
