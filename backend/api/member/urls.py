from rest_framework.routers import DefaultRouter
from .views import MemberViewSet
from django.urls import path

router = DefaultRouter()
router.register('members', MemberViewSet, basename='members')

urlpatterns = router.urls + [
	path('members/', MemberViewSet.as_view({'get': 'members_list'}), name='members-list-alias'),
	path('departments/', MemberViewSet.as_view({'get': 'departments'}), name='departments-alias'),
]
