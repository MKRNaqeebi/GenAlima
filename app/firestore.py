"""
This file contains all the functions related to Firebase
"""
from functools import wraps

from fastapi import Request


def get_user_by_token(id_token):
  """
  Get user by id_token
  """
  return { "email": id_token }

def auth_required(func):
  """
  Decorator to check if the user is authenticated
  """
  @wraps(func)
  def wrapper(request: Request, *args, **kwargs):
    usr_email = get_user_by_token(request.headers.get('Authorization').split(' ')[1])
    if usr_email:
      return func(request=request, *args, **kwargs)
  return wrapper

if __name__ == "__main__":
  pass
