FROM python:3.11.4

# install nodejs 18
RUN apt-get update
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

RUN mkdir /code
RUN mkdir /code/frontend
WORKDIR /code/frontend
COPY ./frontend/package.json /code/frontend
COPY ./frontend/package-lock.json /code/frontend
RUN npm install

WORKDIR /code
RUN pip install --upgrade pip
COPY requirements.txt /code/
RUN pip install --no-cache-dir -r /code/requirements.txt
COPY . /code/

WORKDIR /code/frontend
RUN npm run build

WORKDIR /code

EXPOSE 8080

CMD uvicorn main:app --host 0.0.0.0 --port 8080
# docker build -t alima:1 .
# docker rm gen -f
# docker run --name=gen -p 8080:8080 alima:1
