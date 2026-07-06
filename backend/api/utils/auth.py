from django.core.signing import TimestampSigner, SignatureExpired, BadSignature
from django.db import connection
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied

AUTH_TOKEN_SALT = 'auth-session'
AUTH_TOKEN_MAX_AGE = 60 * 60 * 8  # 8 hours


def build_auth_token(email):
    signer = TimestampSigner(salt=AUTH_TOKEN_SALT)
    return signer.sign(email)


def read_auth_token(token, max_age_seconds=AUTH_TOKEN_MAX_AGE):
    signer = TimestampSigner(salt=AUTH_TOKEN_SALT)
    return signer.unsign(token, max_age=max_age_seconds)


def get_verified_user(request):
    """Verify the Authorization: Bearer <token> header against the signed
    session token issued at login.

    Returns (user_id, email, role_id) for the verified, currently-active
    user. Raises rest_framework.exceptions.AuthenticationFailed if the
    token is missing, malformed, expired, or no longer belongs to an
    active user.
    """
    auth_header = request.headers.get('Authorization', '')
    token = auth_header[7:].strip() if auth_header.lower().startswith('bearer ') else ''
    if not token:
        raise AuthenticationFailed('Missing authentication token.')

    try:
        email = read_auth_token(token)
    except SignatureExpired:
        raise AuthenticationFailed('Session has expired, please log in again.')
    except BadSignature:
        raise AuthenticationFailed('Invalid authentication token.')

    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, role_id FROM users WHERE LOWER(email) = LOWER(%s) AND is_active = true",
            [email],
        )
        row = cursor.fetchone()

    if not row:
        raise AuthenticationFailed('User not found or inactive.')

    return row[0], email, row[1]


def get_verified_admin(request):
    """Same as get_verified_user, but additionally requires role_id == 1
    (admin). Raises rest_framework.exceptions.PermissionDenied if the
    verified user is not an admin.

    Returns (user_id, email).
    """
    user_id, email, role_id = get_verified_user(request)
    if role_id != 1:
        raise PermissionDenied('Admin privileges required for this action.')
    return user_id, email


def get_verified_member(request):
    """Verify the Authorization: Bearer <token> header and resolve the
    requesting user's own member_id server-side — never trust a
    client-supplied member_id for this.

    Returns (user_id, email, member_id, role_id). member_id is None if
    the verified user has no linked member record (e.g. an admin-only
    account with no member profile).
    """
    user_id, email, role_id = get_verified_user(request)
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT id FROM members WHERE user_id = %s LIMIT 1",
            [user_id],
        )
        row = cursor.fetchone()
    member_id = row[0] if row else None
    return user_id, email, member_id, role_id
