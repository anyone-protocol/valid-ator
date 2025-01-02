job "mongo-validator-live" {
  datacenters = ["ator-fin"]
  type = "service"

  group "mongo-validator-live-group" {
    
    count = 1

    volume "mongodb-live" {
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
    }

    task "validator-live-mongo" {
      driver = "docker"
      config {
        image = "mongo:5.0"
        args = [ "--port", "${NOMAD_PORT_mongodb}" ]
      }

      volume_mount {
        volume = "mongodb-live"
        destination = "/data/db"
        read_only = false
      }

      resources {
        cpu    = 2048
        memory = 4096
      }

      service {
        name = "validator-live-mongo"
        port = "mongodb"        
        
        check {
          name     = "live MongoDB health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }
  }
}