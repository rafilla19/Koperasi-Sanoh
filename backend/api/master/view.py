from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import connection
from api.master.models import Status, Member, SHUComponent, Department
from rest_framework import serializers
from django.utils import timezone

class SHUComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SHUComponent
        fields = '__all__'

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'department_name']

class StatusViewSet(viewsets.ViewSet):
    def list(self, request):
        category = request.query_params.get('category')

        data = Status.objects.filter(
            status_category__category_name=category,
            is_active=True,
            deleted_at__isnull=True
        ).values('id', 'status_name')
        return Response(list(data))

class MemberViewSet(viewsets.ViewSet):
    def list(self, request):
        # Mengembalikan semua data member untuk keperluan testing tanpa login
        data = Member.objects.all().values('id', 'full_name', 'employee_status_id')
        return Response(list(data))

    @action(detail=False, methods=['get'])
    def pdf_info(self, request):
        member_id = 1
        query = """
        SELECT
            m.full_name,
            m.phone_number, 
            d.department_name, 
            m.id, 
            m.join_date  
        FROM members m
        INNER JOIN departments d ON m.department_id = d.id
        WHERE m.id = %s
        """
        with connection.cursor() as cursor:
            cursor.execute(query, [member_id])
            columns = [col[0] for col in cursor.description]
            row = cursor.fetchone()
            result = dict(zip(columns, row)) if row else None
            
        return Response(result)

class SHUComponentViewSet(viewsets.ModelViewSet):
    queryset = SHUComponent.objects.filter(deleted_at__isnull=True).order_by('id')
    serializer_class = SHUComponentSerializer

    def perform_create(self, serializer):
        serializer.save(created_at=timezone.now(), updated_at=timezone.now())

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save()

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.filter(deleted_at__isnull=True).order_by('department_name')
    serializer_class = DepartmentSerializer

    def perform_create(self, serializer):
        serializer.save(created_at=timezone.now(), updated_at=timezone.now())

    def perform_update(self, serializer):
        serializer.save(updated_at=timezone.now())

    def perform_destroy(self, instance):
        instance.deleted_at = timezone.now()
        instance.save()