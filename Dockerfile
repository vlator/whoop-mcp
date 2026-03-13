# Use official Bun image
FROM oven/bun:1.3-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Create data directory for token persistence
RUN mkdir -p /app/data

# Expose the default port
EXPOSE 3000

# Health check against the landing page
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun run -e "fetch('http://localhost:' + (process.env.PORT || '3000') + '/').then(r => r.ok || process.exit(1)).catch(() => process.exit(1))"

# Run the application
CMD ["bun", "run", "index.ts"]
