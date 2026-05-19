from rest_framework.routers import DefaultRouter
from .view import StatusViewSet, MemberViewSet, SHUComponentViewSet, DepartmentViewSet, AuthViewSet, PaymentChannelViewSet, IncomeExpenseCategoryViewSet

router = DefaultRouter()
router.register('statuses', StatusViewSet, basename='statuses')
router.register('members', MemberViewSet, basename='members')
router.register('shu-components', SHUComponentViewSet, basename='shu-components')
router.register('departments', DepartmentViewSet, basename='departments')
router.register('payment-channels', PaymentChannelViewSet, basename='payment-channels')
router.register('income-expense-categories', IncomeExpenseCategoryViewSet, basename='income-expense-categories')
router.register('auth', AuthViewSet, basename='auth')

urlpatterns = router.urls