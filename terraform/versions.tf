terraform {
  required_version = ">= 1.10"

  backend "s3" {
    bucket       = "tc-fase4-tfstate-538880133939"
    key          = "os/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "oficina-fase4"
      Service   = "os"
      ManagedBy = "terraform"
    }
  }
}
