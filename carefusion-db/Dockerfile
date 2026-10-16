FROM postgres:16
WORKDIR /migrations
COPY migrations/ ./migrations/
COPY run_migrations.sh ./
RUN chmod +x run_migrations.sh
CMD ["./run_migrations.sh"]
