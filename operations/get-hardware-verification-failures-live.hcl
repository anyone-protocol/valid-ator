job "get-hardware-verification-failures-live" {
  datacenters = ["ator-fin"]
  type = "batch"

  group "get-hardware-verification-failures-live-group" {
    count = 1

    task "get-hardware-verification-failures-live-task" {
      driver = "docker"

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
        volumes = [
          "local:/data"
          ]
        entrypoint = [ "node" ]
        args = [
          "dist/cli/main.js",
          "get-hardware-verification-failures",
          "/data/hardware-verification-failures.json"
        ]
      }
    }
  }
}
