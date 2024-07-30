job "seed-relay-sale-data" {
  datacenters = ["ator-fin"]
  type = "batch"

  group "seed-relay-sale-data-group" {
    count = 1

    volume "relay-sale-data-volume" {
      type = "host"
      read_only = true
      source = "relay-sale-data-volume"
    }

    network {
      mode = "bridge"
      port "validator" {
        to = 3000
        host_network = "wireguard"
      }
    }

    vault {
      // TODO
    }

    task "seed-relay-sale-data-task" {
      driver = "docker"

      volume_mount {
        volume = "relay-sale-data-volume"

        read_only = true
      }

      env {
        // TODO
      }

      template {
        // TODO
      }

      config {
        image = "ghcr.io/ator-development/valid-ator:[[.deploy]]"
        entrypoint = [ "npm" ]
        args = [
          "run", "cli", "--",
          "seed", "relay-sale-data",
          "--data", "TODO -> pathtodata" // TODO
        ]
      }
    }
  }
}
