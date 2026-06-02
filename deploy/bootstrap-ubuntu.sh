#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib nginx build-essential openssl
sudo -u postgres psql <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'evac_app') THEN
    CREATE ROLE evac_app LOGIN PASSWORD 'evac_dev_password';
  END IF;
END $$;
SELECT 'CREATE DATABASE evac_cloud OWNER evac_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evac_cloud')\gexec
SQL
cp /home/mdares/evac-cloud/deploy/evac-cloud.service /tmp/evac-cloud.service
sudo mv /tmp/evac-cloud.service /etc/systemd/system/evac-cloud.service
cp /home/mdares/evac-cloud/deploy/nginx-evac-cloud.conf /tmp/evac-cloud.conf
sudo mv /tmp/evac-cloud.conf /etc/nginx/sites-available/evac-cloud
sudo ln -sf /etc/nginx/sites-available/evac-cloud /etc/nginx/sites-enabled/evac-cloud
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable evac-cloud nginx postgresql
