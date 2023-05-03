job "valid-ator-live" {
  datacenters = ["ator-1"]
  type = "service"

  group "valid-ator-live-group" {
    
    count = 1

    volume "valid-ator-live-mongo" {
      type = "host"
      read_only = false
      source = "valid-ator-live-mongo"
    }

    network {
      mode = "bridge"
      port "mongodb" {
        to = 27017
      }
      port "rediscache" {
        to = 6379
      }
      port "validator" {
        to = 3000
      }
    }

    task "valid-ator-live-mongo {
      driver = "docker"
      config {
        image = "mongo:5.0"
      }

      lifecycle {
        sidecar = true
        hook = "prestart"
      }

      volume_mount {
        volume = "valid-ator-live-mongo"
        destination = "/data/db"
        read_only = false
      }
    }

    task "valid-ator-live-redis {
      driver = "docker"
      config {
        image = "redis:7"
      }
      
      logs {
        max_files     = 5
        max_file_size = 15
      }

      lifecycle {
        sidecar = true
        hook = "prestart"
      }

      
      vault {
        policies = ["valid-ator-live-redis"]
      }

      template {
        data = <<EOH
        {{with secret "valid-ator/live-redis"}}
          REDIS_HOSTNAME="{{.Data.data.REDIS_HOSTNAME}}"
          REDIS_PORT={{.Data.data.REDIS_PORT}}
        {{end}}
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        
      }

      resources {
        cpu    = 2048
        memory = 4096
        network {
          mbits = 10
          port "cache" { }
        }
      }

      service {
        name = "valid-ator-live-redis"
        port = "cache"
        
        check {
          name     = "Redis health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
          check_restart {
            limit = 30
            grace = "15s"
          }
        }
      }
    }

    task "valid-ator-live-service" {
      driver = "docker"
      config {
        image = "ghcr.io/ator-development/valid-ator:0.2.3"
      }

      vault {
        policies = ["valid-ator-live"]
      }

      template {
        data = <<EOH
        {{with secret "valid-ator/live"}}
          RELAY_REGISTRY_OWNER_KEY="{{.Data.data.RELAY_REGISTRY_OWNER_KEY}}"
        {{end}}
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        IS_LIVE=false
        MONGO_URI="mongodb://${NOMAD_IP_mongodb}:${NOMAD_PORT_mongodb}/valid-ator-dev"
        REDIS_HOSTNAME="${NOMAD_IP_rediscache}"
        REDIS_PORT=${NOMAD_PORT_rediscache}
        ONIONOO_REQUEST_TIMEOUT=60000
        ONIONOO_REQUEST_MAX_REDIRECTS=3
        ONIONOO_DETAILS_URI="https://onionoo.torproject.org/details"
        RELAY_REGISTRY_OWNER_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
        RELAY_REGISTRY_TXID="kvPua_H71Iwsvx4q-SwAmSMuw7Y9Tj8DyxUIhFKK-JQ"
      }

      resources {
        cpu    = 4096
        memory = 4096
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
            limit = 30
            grace = "15s"
          }
        }
      }
    }
  }
}