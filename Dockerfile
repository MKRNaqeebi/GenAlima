FROM python:3.11.4

WORKDIR /code

RUN pip install --upgrade pip
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir -r /code/requirements.txt

COPY ./ /code/

EXPOSE 8080

CMD ["python", "main.py"]
# docker build -t alima:1 .
# docker rm gen -f
# docker run --name=gen -d -p 80:8080 alima:1
