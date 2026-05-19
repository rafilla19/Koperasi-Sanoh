"""
Views - API Endpoints untuk ML Service
Integration points untuk Loan Application dan Approval
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
import logging

from ml_service.trainer import get_prediction
from ml_service.utils import ModelManager
from api.master.models import Member

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def predict_loan_eligibility(request):
    """
    Predict loan eligibility dan suggested interest rate untuk member.
    
    Digunakan di:
    1. Loan Application Form - show rekomendasi saat member input
    2. Admin Approval Panel - show rekomendasi saat admin review
    
    Request:
    {
        "member_id": 1,
        "principal": 5000000,
        "duration_months": 12
    }
    
    Response:
    {
        "success": true,
        "eligibility": "High|Medium|Low",
        "probability": 0.85,
        "suggested_interest_rate": 0.95,
        "recommendation": "...",
        "risk_factors": [...],
        "member_info": {...}
    }
    """
    try:
        # Validate input
        member_id = request.data.get('member_id')
        principal = request.data.get('principal')
        duration_months = request.data.get('duration_months')
        
        if not all([member_id, principal, duration_months]):
            return Response(
                {'error': 'Missing required fields: member_id, principal, duration_months'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate member exists
        try:
            member = Member.objects.get(id=member_id)
        except Member.DoesNotExist:
            return Response(
                {'error': f'Member with id {member_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Validate values
        try:
            principal = float(principal)
            duration_months = int(duration_months)
            
            if principal <= 0:
                raise ValueError("Principal must be > 0")
            if duration_months <= 0 or duration_months > 120:
                raise ValueError("Duration must be between 1 and 120 months")
        except ValueError as e:
            return Response(
                {'error': f'Invalid input values: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get prediction
        prediction = get_prediction(principal, duration_months, member_id)
        
        # Prepare response
        response_data = {
            'success': prediction['success'],
            'eligibility': prediction['eligibility'],
            'probability': prediction['probability'],
            'suggested_interest_rate': prediction['suggested_interest_rate'],
            'recommendation': prediction['recommendation'],
            'risk_factors': prediction['risk_factors'],
            'member_info': {
                'id': member_id,
                'name': member.full_name,
                'current_savings': prediction['member_features'].get('current_savings', 0),
                'payment_history': {
                    'on_time': prediction['member_features'].get('on_time_payments', 0),
                    'late': prediction['member_features'].get('late_payments', 0),
                },
                'active_loans': prediction['member_features'].get('total_loans_active', 0),
                'tenure_months': prediction['member_features'].get('member_tenure_months', 0),
            }
        }
        
        logger.info(f"Prediction generated for member {member_id}: {prediction['eligibility']}")
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error in predict_loan_eligibility: {str(e)}")
        return Response(
            {'error': f'Prediction error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_model_info(request):
    """
    Get informasi model terakhir - untuk monitoring dan debugging.
    
    Response:
    {
        "success": true,
        "model_version": "20240516_120000",
        "training_date": "2024-05-16T12:00:00",
        "feature_names": [...],
        "model_info": {...}
    }
    """
    try:
        manager = ModelManager()
        metadata = manager.get_model_info()
        
        if metadata is None:
            return Response(
                {'error': 'No model found. Please train the model first.'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        response_data = {
            'success': True,
            'model_version': metadata.get('version'),
            'training_date': metadata.get('training_date'),
            'saved_at': metadata.get('saved_at'),
            'feature_names': metadata.get('feature_names', []),
            'model_info': metadata.get('model_info', {})
        }
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error in get_model_info: {str(e)}")
        return Response(
            {'error': f'Error retrieving model info: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_models(request):
    """
    List semua available model versions.
    
    Response:
    {
        "success": true,
        "models": [
            {"version": "20240516_120000", "saved_at": "..."},
            ...
        ]
    }
    """
    try:
        manager = ModelManager()
        versions = manager.list_models()
        
        models = []
        for version in versions:
            metadata = manager.get_model_info(version)
            if metadata:
                models.append({
                    'version': version,
                    'saved_at': metadata.get('saved_at'),
                    'training_date': metadata.get('training_date')
                })
        
        return Response(
            {'success': True, 'models': models},
            status=status.HTTP_200_OK
        )
        
    except Exception as e:
        logger.error(f"Error in list_models: {str(e)}")
        return Response(
            {'error': f'Error listing models: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def trigger_training(request):
    """
    Trigger manual model training (admin only).
    
    Response:
    {
        "success": true,
        "message": "Model training started..."
    }
    """
    try:
        # Check if user is admin
        if not hasattr(request.user, 'role') or request.user.role.role_name != 'Admin':
            return Response(
                {'error': 'Only administrators can trigger training'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        from ml_service.trainer import trigger_model_training
        
        success = trigger_model_training()
        
        if success:
            logger.info("Model training triggered manually")
            return Response(
                {'success': True, 'message': 'Model training initiated'},
                status=status.HTTP_200_OK
            )
        else:
            return Response(
                {'success': False, 'message': 'Failed to start training'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
    except Exception as e:
        logger.error(f"Error triggering training: {str(e)}")
        return Response(
            {'error': f'Error: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
