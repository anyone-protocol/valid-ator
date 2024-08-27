job "get-hardware-verification-failures-stage" {
  datacenters = ["ator-fin"]
  type = "batch"

  group "get-hardware-verification-failures-stage-group" {
    count = 1

    task "get-hardware-verification-failures-stage-task" {
      driver = "docker"

      template {
        data = <<EOH
        {{- range service "validator-stage-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/valid-ator-stage-testnet"
        {{- end }}
        EOH
        destination = "secrets/file.env"
        env = true
      }

      config {
        image = "ghcr.io/ator-development/valid-ator:stage"
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
