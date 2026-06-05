from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from .models import WAConfig, WAQuestion
from .serializers import WAConfigSerializer, WAQuestionSerializer


# ── WhatsApp Config ──────────────────────────────────────────────────────────

@api_view(['GET'])
def wa_settings(request):
    """Returns active WA phone number + active questions for member frontend."""
    config = WAConfig.objects.filter(is_active=True).first()
    questions = WAQuestion.objects.filter(is_active=True)
    return Response({
        'phone_number': config.phone_number if config else '',
        'questions': WAQuestionSerializer(questions, many=True).data,
    })


@api_view(['GET', 'PATCH'])
def wa_config(request):
    config = WAConfig.objects.first()
    if not config:
        return Response({'detail': 'Config not found.'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'GET':
        return Response(WAConfigSerializer(config).data)
    serializer = WAConfigSerializer(config, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


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
