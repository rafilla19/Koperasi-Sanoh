from django.db import connection
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import WAQuestion
from .serializers import WAQuestionSerializer


def _get_primary_admin_phone():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, number_phone
            FROM users
            WHERE role_id = %s
            ORDER BY id ASC
            LIMIT 1
            """,
            [1],
        )
        row = cursor.fetchone()

    if not row:
        return None

    return {
        'id': row[0],
        'phone_number': row[1] or '',
    }


def _get_primary_admin_contact():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, email, number_phone
            FROM users
            WHERE role_id = %s
            ORDER BY id ASC
            LIMIT 1
            """,
            [1],
        )
        row = cursor.fetchone()

    if not row:
        return None

    return {
        'id': row[0],
        'email': row[1] or '',
        'phone_number': row[2] or '',
    }


def _update_primary_admin_contact(email=None, phone_number=None):
    admin_contact = _get_primary_admin_contact()
    if not admin_contact:
        return None

    updates = []
    params = []

    if email is not None:
        updates.append('email = %s')
        params.append(email)

    if phone_number is not None:
        updates.append('number_phone = %s')
        params.append(phone_number)

    if updates:
        params.append(admin_contact['id'])
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE users
                SET {', '.join(updates)}
                WHERE id = %s
                """,
                params,
            )

    if email is not None:
        admin_contact['email'] = email
    if phone_number is not None:
        admin_contact['phone_number'] = phone_number

    return admin_contact


def _update_primary_admin_phone(phone_number):
    admin_phone = _update_primary_admin_contact(phone_number=phone_number)
    if not admin_phone:
        return None

    return admin_phone


# ── WhatsApp Config ──────────────────────────────────────────────────────────

@api_view(['GET'])
def wa_settings(request):
    """Returns active WA phone number + active questions for member frontend."""
    admin_phone = _get_primary_admin_phone()
    questions = WAQuestion.objects.filter(is_active=True)
    return Response({
        'phone_number': admin_phone['phone_number'] if admin_phone else '',
        'questions': WAQuestionSerializer(questions, many=True).data,
    })


@api_view(['GET', 'PATCH'])
def wa_config(request):
    if request.method == 'GET':
        admin_contact = _get_primary_admin_contact()
        if not admin_contact:
            return Response({'detail': 'Admin phone not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'email': admin_contact['email'],
            'phone_number': admin_contact['phone_number'],
        })

    email = request.data.get('email')
    phone_number = (request.data.get('phone_number') or '').strip()
    if email is not None:
        email = (email or '').strip()
    if email == '' and phone_number == '':
        return Response({'detail': 'No data provided.'}, status=status.HTTP_400_BAD_REQUEST)

    admin_contact = _update_primary_admin_contact(
        email=email if email is not None else None,
        phone_number=phone_number if phone_number else None,
    )
    if not admin_contact:
        return Response({'detail': 'Admin phone not found.'}, status=status.HTTP_404_NOT_FOUND)

    return Response({
        'email': admin_contact['email'],
        'phone_number': admin_contact['phone_number'],
    })


@api_view(['GET', 'POST'])
def wa_questions_list(request):
    if request.method == 'GET':
        questions = WAQuestion.objects.all()
        return Response(WAQuestionSerializer(questions, many=True).data)
    serializer = WAQuestionSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH', 'DELETE'])
def wa_question_detail(request, pk):
    try:
        question = WAQuestion.objects.get(pk=pk)
    except WAQuestion.DoesNotExist:
        return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        question.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = WAQuestionSerializer(question, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
