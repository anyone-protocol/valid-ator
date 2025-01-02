job "mongo-validator-stage" {
  datacenters = ["ator-fin"]
  type = "service"

  group "mongo-validator-stage-group" {
    
    count = 1

    volume "mongodb-stage" {
      type = "host"
      read_only = false
      source = "mongodb-stage"
    }

    network {
      mode = "bridge"
      port "mongodb" {
        static = 37002
        host_network = "wireguard"
      }
    }

    task "validator-stage-mongo" {
      driver = "docker"
      config {
        image = "mongo:5.0"
        args = [ "--port", "${NOMAD_PORT_mongodb}" ]
      }

      volume_mount {
        volume = "mongodb-stage"
        destination = "/data/db"
        read_only = false
      }

      resources {
        cpu    = 2048
        memory = 4096
      }

      service {
        name = "validator-stage-mongo"
        port = "mongodb"        
        
        check {
          name     = "Stage MongoDB health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }
  }
}