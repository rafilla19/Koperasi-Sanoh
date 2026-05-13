from rest_framework.routers import DefaultRouter
from .view import LoanApplicationViewSet, LoanTypeViewSet, LoanViewSet, LoanInstallmentViewSet

router = DefaultRouter()
router.register('loan-applications', LoanApplicationViewSet, basename='loan-applications')
router.register('loan-types', LoanTypeViewSet)
router.register('loans', LoanViewSet, basename='loans')
router.register('loan-installments', LoanInstallmentViewSet, basename='loan-installments')

urlpatterns = router.urls