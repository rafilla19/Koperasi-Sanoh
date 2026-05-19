"""
URLs - API endpoints untuk ML Service
"""
from django.urls import path
from ml_service import views

app_name = 'ml_service'

urlpatterns = [
    # Prediction endpoint - untuk loan application dan approval
    path('predict-eligibility/', views.predict_loan_eligibility, name='predict_eligibility'),
    
    # Model management endpoints
    path('model-info/', views.get_model_info, name='model_info'),
    path('models/', views.list_models, name='list_models'),
    path('train/', views.trigger_training, name='trigger_training'),
]
