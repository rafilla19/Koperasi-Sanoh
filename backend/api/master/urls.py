from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import StatusViewSet, SHUComponentViewSet, DepartmentViewSet, AuthViewSet, PaymentChannelViewSet, IncomeExpenseCategoryViewSet, BankViewSet, EmployeeStatusViewSet, document_archive_list_create, document_type_list

router = DefaultRouter()
router.register('statuses', StatusViewSet, basename='statuses')
router.register('banks', BankViewSet, basename='banks')
router.register('shu-components', SHUComponentViewSet, basename='shu-components')
router.register('departments', DepartmentViewSet, basename='departments')
router.register('employee-statuses', EmployeeStatusViewSet, basename='employee-statuses')
router.register('payment-channels', PaymentChannelViewSet, basename='payment-channels')
router.register('income-expense-categories', IncomeExpenseCategoryViewSet, basename='income-expense-categories')
router.register('auth', AuthViewSet, basename='auth')

# include router generated routes and add custom document routes
urlpatterns = router.urls + [
    path('documents/', document_archive_list_create, name='document_archive_list_create'),
    path('document-types/', document_type_list, name='document_type_list'),
]
