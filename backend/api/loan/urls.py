from rest_framework.routers import DefaultRouter
from .view import LoanApplicationViewSet, LoanTypeViewSet, LoanViewSet, LoanInstallmentViewSet, LoanFundingSettingViewSet

router = DefaultRouter()
router.register('loan-applications', LoanApplicationViewSet, basename='loan-applications')
router.register('loan-types', LoanTypeViewSet)
router.register('loans', LoanViewSet, basename='loans')
router.register('loan-installments', LoanInstallmentViewSet, basename='loan-installments')
router.register('loan-funding-settings-list', LoanFundingSettingViewSet, basename='loan-funding-settings-list')

urlpatterns = router.urls