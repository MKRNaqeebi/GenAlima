from datetime import datetime, timedelta
import multiprocessing
from functools import wraps

from fastapi import Request
from firebase_admin import credentials, initialize_app, firestore, auth
import requests
import jwt

from config import GOOGLE_CLOUD_PROJECT, SECRET_KEY, FIRE_LOGIN_API_URL

cred = credentials.Certificate(GOOGLE_CLOUD_PROJECT)
initialize_app(cred)
db = firestore.client()

def save_document_to_firebase(collection_name, document):
    if "id" in document:
        db.collection(collection_name).document(item["id"]).set(document)
    else:
        db.collection(collection_name).add(document)

def update_document_to_firebase(collection_name, id, document):
    db.collection(collection_name).document(id).update(document)

def get_documents_from_firebase(collection_name):
    documents = db.collection(collection_name).stream()
    return [document.to_dict() for document in documents]

def get_document_by_id(collection_name, id):
    documents = db.collection(collection_name).document(id).get()
    return documents.to_dict()

def get_documents_by_filter(collection_name, key, operator, value):
    documents = db.collection(collection_name).where(key, operator, value).stream()
    return [document.to_dict() for document in documents]

def get_documents_order_by(collection_name, key):
    documents = db.collection(collection_name).order_by(key).stream()
    return [document.to_dict() for document in documents]

def delete_document_from_firebase(collection_name, id):
    db.collection(collection_name).document(id).delete()

def get_users_from_firebase():
    users = auth.list_users().users
    user_info = get_data_from_firebase('user-info')
    users_dict = [user._data for user in users]
    for user in users_dict:
        for info in user_info:
            if user['localId'] == info['id']:
                user['role'] = info['role']
                user['admin'] = bool(info.get('admin', False))
                break
    return users_dict

def invite_user_to_firebase(email, display_name, role, admin):
    user = auth.create_user(email=email, display_name=display_name)
    save_data_to_firebase([{ 'id': user.uid, 'email': email, 'role': role, 'admin': admin}], 'user-info')
    # create password reset link
    link = auth.generate_password_reset_link(email)
    # save link to firebase
    emailData = {
        'id': user.uid,
        'to': email,
        'message': {
            'subject': 'You are invited to Spark!',
            'html': f'Hi {display_name},<br/>Here is <a href="{link}">invite link<a> please click on it to set your password.<br/>Login with your email and password to access the <a href="https://spark.powermyanalytics.com/">Spark</a><br/>Thanks,<br/>Spark Team',
        },
    }
    save_data_to_firebase([emailData], 'email')
    user_data = user._data
    user_data['role'] = role
    user_data['admin'] = admin
    return user_data

def delete_user_from_firebase(uid):
    auth.delete_user(uid)

def encode_jwt_token(user_id):
    encoded_jwt = jwt.encode({"uid": user_id}, SECRET_KEY, algorithm='HS256')
    return encoded_jwt

def decode_jwt_token(token):
    decoded_jwt = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
    return decoded_jwt.get('uid', '')

def fire_base_login(email, password):
    """
    Login to Firebase using email and password
    """
    response = requests.post(FIRE_LOGIN_API_URL, json={
        'email': email,
        'password': password,
        'returnSecureToken': True,
    })
    json_resp = response.json()
    user_id = json_resp.get('localId', '')
    user_info = db.collection('user-info').document(user_id).get()
    json_resp['admin'] = user_info.to_dict().get('admin', False)
    json_resp['idToken'] = encode_jwt_token(user_id)
    return json_resp

def get_user_by_token(id_token):
    """
    Get user by id_token
    """
    try:
        user_id = decode_jwt_token(id_token)
        user_info = db.collection('user-info').document(user_id).get()
        return user_info.to_dict()
    except Exception as e:
        print(e)
        return {}

def auth_required(func):
    @wraps(func)
    def wrapper(request: Request, *args, **kwargs):
        usr_email = get_user_by_token(request.headers.get('Authorization').split(' ')[1])
        if usr_email:
            return func(request=request, *args, **kwargs)
    return wrapper

if __name__ == "__main__":
    pass
