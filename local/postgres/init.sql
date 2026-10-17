-- Um Postgres local com um banco e um usuário por serviço (no EKS são 3 RDS).
CREATE USER catalog WITH PASSWORD 'catalog';
CREATE DATABASE catalog OWNER catalog;
CREATE USER billing WITH PASSWORD 'billing';
CREATE DATABASE billing OWNER billing;
CREATE USER os WITH PASSWORD 'os';
CREATE DATABASE os OWNER os;
