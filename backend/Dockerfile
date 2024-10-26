# stage: 1
FROM node:16-alpine

# Set environment variables
ENV DOCKER_VERSION=20.10.7

# Install Docker CLI
RUN apk add --no-cache \
    curl \
    tar \
    gzip \
    && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-$DOCKER_VERSION.tgz" -o docker.tgz \
    && tar --extract \
           --file docker.tgz \
           --strip-components 1 \
           --directory /usr/local/bin/ \
           docker/docker \
    && rm docker.tgz \
    && apk del \
    curl \
    tar \
    gzip

# Optional: Verify Docker CLI installation
RUN docker --version


WORKDIR /app
COPY . /app

RUN npm i --save --legacy-peer-deps

RUN npm install -g nodemon
RUN npm install -g ts-node

RUN npm install -g @babel/core @babel/cli
RUN npm install -g @babel/node

CMD [ "npm", "run", "dev" ]