from django.urls import path, include

urlpatterns = [
    # path('api/', include('login.urls')),
    path('loan/', include('api.loan.urls')),
    path('master/', include('api.master.urls'))
]
    