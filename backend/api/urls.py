from django.urls import path, include
from .views import (
    wa_settings,
    wa_config,
    wa_questions_list,
    wa_question_detail,
)
from api.master.views import document_archive_list_create, document_type_list

urlpatterns = [
    # path('api/', include('login.urls')),
    path('loan/', include('api.loan.urls')),
    path('master/', include('api.master.urls')),
    path('member/', include('api.member.urls')),
    # expose savings endpoints at /api/ as well for frontend compatibility
    path('', include('api.saving.urls')),
    
    # WhatsApp — public (member)
    path('v1/whatsapp/', wa_settings, name='wa-settings'),

    # WhatsApp — admin CRUD
    path('v1/whatsapp/config/', wa_config, name='wa-config'),
    path('v1/whatsapp/questions/', wa_questions_list, name='wa-questions-list'),
    path('v1/whatsapp/questions/<int:pk>/', wa_question_detail, name='wa-question-detail'),
]

# Convenience aliases so legacy frontend paths work (/api/documents/ and /api/document-types/)
urlpatterns += [
    path('documents/', document_archive_list_create, name='document_archive_list_create_root'),
    path('document-types/', document_type_list, name='document_type_list_root'),
]

