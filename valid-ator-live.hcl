job "valid-ator-live" {
  datacenters = ["ator-fin"]
  type = "service"

  group "valid-ator-live-group" {
    
    count = 1

    volume "mongodb" {
      type = "host"
      read_only = false
      source = "mongodb"
    }

    volume "redis-stage" {
      type = "host"
      read_only = false
      source = "redis-stage"
    }

    network {
      mode = "bridge"
      port "mongodb" {
        static = 37001
        host_network = "wireguard"
      }
      port "rediscache" {
        to = 6379
        host_network = "wireguard"
      }
      port "validator" {
        to = 3000
        host_network = "wireguard"
      }
    }

    task "valid-ator-live-mongo" {
      driver = "docker"
      config {
        image = "mongo:5.0"
        args = [ "--port", "${NOMAD_PORT_mongodb}" ]
      }

      lifecycle {
        sidecar = true
        hook = "prestart"
      }

      volume_mount {
        volume = "mongodb"
        destination = "/data/db"
        read_only = false
      }

      resources {
        cpu    = 2048
        memory = 8192
      }

      service {
        name = "valid-ator-live-mongo"
        port = "mongodb"

        check {
          name     = "MongoDB health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }

    task "valid-ator-live-redis" {
      driver = "docker"
      config {
        image = "redis:7.2"
        args = ["/usr/local/etc/redis/redis.conf"]
        volumes = [
          "local/redis.conf:/usr/local/etc/redis/redis.conf"
        ]
      }

      lifecycle {
        sidecar = true
        hook = "prestart"
      }

      template {
        data = <<EOH
# Based on https://raw.githubusercontent.com/redis/redis/7.2/redis.conf
bind 127.0.0.1
protected-mode yes
port 6379
tcp-backlog 511
timeout 0
tcp-keepalive 300
daemonize no
pidfile /tmp/redis_6379.pid
loglevel notice
logfile ""
databases 16
always-show-logo no
set-proc-title yes
proc-title-template "{title} {listen-addr} {server-mode}"
locale-collate ""
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
rdb-del-sync-files no
dir ./
replica-serve-stale-data yes
replica-read-only yes
repl-diskless-sync yes
repl-diskless-sync-delay 5
repl-diskless-sync-max-replicas 0
repl-diskless-load disabled
repl-disable-tcp-nodelay no
replica-priority 100
acllog-max-len 128
lazyfree-lazy-eviction no
lazyfree-lazy-expire no
lazyfree-lazy-server-del no
replica-lazy-flush no
lazyfree-lazy-user-del no
lazyfree-lazy-user-flush no
oom-score-adj no
oom-score-adj-values 0 200 800
disable-thp yes
appendonly yes
appendfilename "appendonly.aof"
appenddirname "appendonlydir"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb
aof-load-truncated yes
aof-use-rdb-preamble yes
aof-timestamp-enabled no
slowlog-log-slower-than 10000
slowlog-max-len 128
latency-monitor-threshold 0
notify-keyspace-events ""
hash-max-listpack-entries 512
hash-max-listpack-value 64
list-max-listpack-size -2
list-compress-depth 0
set-max-intset-entries 512
set-max-listpack-entries 128
set-max-listpack-value 64
zset-max-listpack-entries 128
zset-max-listpack-value 64
hll-sparse-max-bytes 3000
stream-node-max-bytes 4096
stream-node-max-entries 100
activerehashing yes
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60
hz 10
dynamic-hz yes
aof-rewrite-incremental-fsync yes
rdb-save-incremental-fsync yes
jemalloc-bg-thread yes
        EOH
        destination = "local/redis.conf"
        env         = false
      }

      volume_mount {
        volume = "redis-live"
        destination = "/data"
        read_only = false
      }

      resources {
        cpu    = 4096
        memory = 16384
      }

      service {
        name = "valid-ator-live-redis"
        port = "rediscache"
        
        check {
          name     = "Redis health check"
          type     = "tcp"
          interval = "5s"
          timeout  = "10s"
        }
      }
    }

    task "valid-ator-live-service" {
      driver = "docker"
      config {
        image = "ghcr.io/ator-development/valid-ator:[[.deploy]]"
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
          BUNDLR_NETWORK="{{.Data.data.BUNDLR_NETWORK}}"
          JSON_RPC="{{.Data.data.JSON_RPC}}"
        {{end}}
        RELAY_REGISTRY_CONTRACT_TXID="[[ consulKey "smart-contracts/live/relay-registry-address" ]]"
        DISTRIBUTION_CONTRACT_TXID="[[ consulKey "smart-contracts/live/distribution-address" ]]"
        FACILITY_CONTRACT_ADDRESS="[[ consulKey "facilitator/goerli/live/address" ]]"
        TOKEN_CONTRACT_ADDRESS="[[ consulKey "ator-token/goerli/live/address" ]]"
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        IS_LIVE="true"
        VALIDATOR_VERSION="[[.commit_sha]]"
        MONGO_URI="mongodb://localhost:${NOMAD_PORT_mongodb}/valid-ator-live"
        REDIS_HOSTNAME="localhost"
        REDIS_PORT="${NOMAD_PORT_rediscache}"
        ONIONOO_REQUEST_TIMEOUT=60000
        ONIONOO_REQUEST_MAX_REDIRECTS=3
        ONIONOO_DETAILS_URI="https://onionoo.torproject.org/details"
        BUNDLR_NODE="http://node2.bundlr.network"
        RELAY_REGISTRY_OPERATOR_MIN_BALANCE=1000000
        RELAY_REGISTRY_UPLOADER_MIN_BALANCE=1000000
        DISTRIBUTION_OPERATOR_MIN_BALANCE=1000000
        FACILITY_OPERATOR_MIN_BALANCE=1000000
        FACILITY_TOKEN_MIN_BALANCE=1000000
      }

      resources {
        cpu    = 4096
        memory = 8192
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
            limit = 180
            grace = "15s"
          }
        }
      }
    }
  }
}