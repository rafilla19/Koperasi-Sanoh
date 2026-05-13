from rest_framework.routers import DefaultRouter
from .view import StatusViewSet, MemberViewSet, SHUComponentViewSet, DepartmentViewSet

router = DefaultRouter()
router.register('statuses', StatusViewSet, basename='statuses')
router.register('members', MemberViewSet, basename='members')
router.register('shu-components', SHUComponentViewSet, basename='shu-components')
router.register('departments', DepartmentViewSet, basename='departments')

urlpatterns = router.urls