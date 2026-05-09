#!/usr/bin/env bash
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-usfarcade}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-881933021016}"
IMAGE_TAG="${IMAGE_TAG:-dev}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

services=(
  "frontend:frontend"
  "player-service:services/player-service"
  "game-service:services/game-service"
  "score-service:services/score-service"
  "leaderboard-service:services/leaderboard-service"
)

aws ecr get-login-password \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

for entry in "${services[@]}"; do
  service="${entry%%:*}"
  context="${entry#*:}"
  image="${ECR_REGISTRY}/usfarcade/${service}:${IMAGE_TAG}"

  docker build --platform linux/amd64 -t "${image}" "${context}"
  docker push "${image}"
done

