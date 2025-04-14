# Use the official Node.js LTS image
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files and install dependencies first (to leverage caching)
COPY package*.json ./

RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on (update if your app uses a different port)
EXPOSE 3000

# Start the Node.js app
CMD ["node", "server.js"]
