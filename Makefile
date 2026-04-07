up:
	docker compose up -d
	npm run migration:run

down:
	docker compose down

reset-db:
	docker compose down -v
	docker compose up -d
	npm run migration:run

start:
	npm run start:dev

test-e2e:
	npm run test:e2e
