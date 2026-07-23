# AWS staging deployment

This deployment runs the Node backend in Docker and keeps TLS termination on
the host. The container port is bound only to `127.0.0.1:3000`; it must never
be opened in the EC2 security group.

## Host paths

- Repository: `/opt/agendamiento-hun`
- Runtime secrets: `/etc/agendamiento-hun/backend.env`
- Web service: `agendamiento-hun.service`
- Reminder timer: `agendamiento-hun-reminders.timer`

The secret file must be owned by `root:root` with mode `0600`. Never copy it
into the repository or Docker build context.

## Build validation

```bash
cd /opt/agendamiento-hun
sudo APP_ENV_FILE=.env.example docker compose config --quiet
sudo docker compose build backend
```

Do not start the service with `.env.example`. Create the protected runtime
secret file first and validate `/health/ready`.

## Service installation

```bash
sudo install -m 0644 deploy/systemd/agendamiento-hun.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/agendamiento-hun-reminders.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/agendamiento-hun-reminders.timer /etc/systemd/system/
sudo systemctl daemon-reload
```

Enable the web service only after the runtime secret file exists:

```bash
sudo systemctl enable --now agendamiento-hun.service
```

Keep the reminder timer disabled until a controlled real-send test succeeds.

## Health checks

```bash
curl --fail http://127.0.0.1:3000/health/live
curl --fail http://127.0.0.1:3000/health/ready
sudo docker compose ps
```

`/test-hun` returns `404` unless `ENABLE_DIAGNOSTIC_ENDPOINTS=true`. Enable it
only during a controlled deployment check and disable it immediately after.
