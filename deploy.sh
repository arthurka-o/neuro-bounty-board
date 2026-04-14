#!/usr/bin/env bash
set -e

HOST="root@88.99.168.111"
REPO="/opt/neuro-bounty-board"

case "${1:-testnet}" in
  testnet)
    echo "Deploying TESTNET to reyvon.gay..."
    ssh "$HOST" "cd $REPO && git pull && pnpm install && cd packages/frontend && NEXT_PUBLIC_CHAIN=sepolia pnpm build && systemctl restart bounty-board"
    ;;
  mainnet)
    echo "Deploying MAINNET to prod.reyvon.gay..."
    ssh "$HOST" "cd /opt/neuro-bounty-board-prod && git pull && pnpm install && cd packages/frontend && pnpm build && systemctl restart bounty-board-prod"
    ;;
  *)
    echo "Usage: ./deploy.sh [testnet|mainnet]"
    exit 1
    ;;
esac

echo "Done."
